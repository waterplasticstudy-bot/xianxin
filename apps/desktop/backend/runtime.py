"""Bounded native processes. Resource limits are not a security sandbox."""
import ctypes
import os
from pathlib import Path
import shutil
import signal
import subprocess
import threading
import time


OUTPUT_LIMIT = 65536


def compiler_path():
    for candidate in (shutil.which('gcc'), r'D:\Dev\mingw64\bin\gcc.exe'):
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    return None


def child_environment(compiler, temporary):
    """Do not inherit API keys, tokens, credentials or unrelated configuration."""
    temporary.mkdir(parents=True, exist_ok=True)
    result = {'TEMP': str(temporary), 'TMP': str(temporary), 'TMPDIR': str(temporary)}
    for name in ('SystemRoot', 'WINDIR', 'COMSPEC', 'SYSTEMDRIVE'):
        if name in os.environ:
            result[name] = os.environ[name]
    if os.name == 'nt':
        system = Path(os.environ.get('SystemRoot', r'C:\Windows'))
        result['PATH'] = str(Path(compiler).parent) + os.pathsep + str(system / 'System32')
    else:
        result['PATH'] = str(Path(compiler).parent) + os.pathsep + '/usr/bin:/bin'
        result['LANG'] = 'C.UTF-8'
    return result


class WindowsJob:
    """Closing the job kills remaining descendants, even if the parent exited."""
    def __init__(self):
        from ctypes import wintypes
        class BASIC(ctypes.Structure):
            _fields_ = [('PerProcessUserTimeLimit', ctypes.c_int64), ('PerJobUserTimeLimit', ctypes.c_int64),
                        ('LimitFlags', wintypes.DWORD), ('MinimumWorkingSetSize', ctypes.c_size_t),
                        ('MaximumWorkingSetSize', ctypes.c_size_t), ('ActiveProcessLimit', wintypes.DWORD),
                        ('Affinity', ctypes.c_size_t), ('PriorityClass', wintypes.DWORD), ('SchedulingClass', wintypes.DWORD)]
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in ('ReadOperationCount', 'WriteOperationCount', 'OtherOperationCount', 'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount')]
        class EXTENDED(ctypes.Structure):
            _fields_ = [('BasicLimitInformation', BASIC), ('IoInfo', IO), ('ProcessMemoryLimit', ctypes.c_size_t),
                        ('JobMemoryLimit', ctypes.c_size_t), ('PeakProcessMemoryUsed', ctypes.c_size_t), ('PeakJobMemoryUsed', ctypes.c_size_t)]
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise OSError('无法建立 Windows 进程清理任务。')
        info = EXTENDED()
        info.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(info), ctypes.sizeof(info)):
            self.close()
            raise OSError('无法设置 Windows 进程清理任务。')

    def assign(self, process):
        if not self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)):
            raise OSError('无法保护本地子进程；已取消运行。')

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def run_bounded(arguments, cwd, environment, timeout, stdin='', limit=OUTPUT_LIMIT):
    """No shell, bounded captured output, timeout, deterministic descendant cleanup."""
    job = WindowsJob() if os.name == 'nt' else None
    process = None
    chunks = []
    overflow = threading.Event()
    started = time.monotonic()
    reason = None
    reader = None
    try:
        # Start suspended so a fast program cannot spawn descendants before job assignment.
        options = {'creationflags': subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP | 0x4} if os.name == 'nt' else {'start_new_session': True}
        process = subprocess.Popen(arguments, cwd=str(cwd), env=environment, stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False, **options)
        if job:
            job.assign(process)
            resume = ctypes.WinDLL('ntdll').NtResumeProcess
            resume.argtypes = [ctypes.c_void_p]
            resume.restype = ctypes.c_long
            if resume(int(process._handle)) < 0:
                raise OSError('无法启动受进程清理保护的本地程序。')

        def drain():
            size = 0
            try:
                while True:
                    chunk = process.stdout.read(4096)
                    if not chunk:
                        break
                    if size < limit:
                        chunks.append(chunk[:limit-size])
                    size += len(chunk)
                    if size > limit:
                        overflow.set()
            except (OSError, ValueError):
                pass

        reader = threading.Thread(target=drain, daemon=True)
        reader.start()
        def feed():
            try:
                process.stdin.write(stdin.encode('utf-8'))
                process.stdin.close()
            except (BrokenPipeError, OSError, ValueError):
                pass
        writer = threading.Thread(target=feed, daemon=True)
        writer.start()
        while process.poll() is None:
            if overflow.is_set():
                reason = 'output_limit'
                break
            if time.monotonic() - started >= timeout:
                reason = 'timeout'
                break
            time.sleep(0.015)
    finally:
        if job:
            job.close()
        elif process:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if process:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            if 'writer' in locals():
                writer.join(timeout=3)
            if reader:
                reader.join(timeout=3)
            for stream in (process.stdin, process.stdout):
                if stream and not stream.closed:
                    stream.close()
    if overflow.is_set():
        reason = 'output_limit'
    return {'returncode': process.returncode, 'output': b''.join(chunks).decode('utf-8', errors='replace'),
            'reason': reason, 'seconds': round(time.monotonic() - started, 3)}
