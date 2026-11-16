"""Windows DPAPI secrets, deliberately separate from exported learner data."""
import ctypes
import os
from pathlib import Path


class SecretStore:
    def __init__(self, path):
        self.path = Path(path)

    def has_key(self):
        return self.path.is_file()

    @staticmethod
    def transform(data, decrypt=False):
        if os.name != 'nt':
            raise ValueError('API 密钥保存需要 Windows DPAPI；此系统不支持保存密钥。')
        from ctypes import wintypes
        class BLOB(ctypes.Structure):
            _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_ubyte))]
        buffer = ctypes.create_string_buffer(data)
        source = BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
        output = BLOB()
        crypt = ctypes.WinDLL('crypt32', use_last_error=True)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        crypt.CryptProtectData.argtypes = [ctypes.POINTER(BLOB), wintypes.LPCWSTR, ctypes.POINTER(BLOB), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(BLOB)]
        crypt.CryptProtectData.restype = wintypes.BOOL
        crypt.CryptUnprotectData.argtypes = [ctypes.POINTER(BLOB), ctypes.POINTER(wintypes.LPWSTR), ctypes.POINTER(BLOB), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(BLOB)]
        crypt.CryptUnprotectData.restype = wintypes.BOOL
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree.restype = ctypes.c_void_p
        if decrypt:
            success = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
        else:
            success = crypt.CryptProtectData(ctypes.byref(source), 'STM32 Studio DeepSeek', None, None, None, 1, ctypes.byref(output))
        if not success:
            raise ValueError(f'无法读取或保存 Windows 加密密钥（系统错误 {ctypes.get_last_error()}），请在当前 Windows 账户的正常桌面环境启动网站后重试。')
        try:
            return ctypes.string_at(output.pbData, output.cbData)
        finally:
            kernel.LocalFree(output.pbData)

    def read(self):
        if not self.has_key():
            raise ValueError('尚未配置 DeepSeek API Key，请先打开设置填写。')
        return self.transform(self.path.read_bytes(), decrypt=True).decode('utf-8')

    def write(self, value):
        encrypted = self.transform(value.encode('utf-8'))
        temporary = self.path.with_suffix('.tmp')
        temporary.write_bytes(encrypted)
        os.replace(temporary, self.path)

    def clear(self):
        self.path.unlink(missing_ok=True)
