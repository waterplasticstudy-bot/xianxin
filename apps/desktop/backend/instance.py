"""A process lease prevents two servers from replacing the same learning state."""
from contextlib import contextmanager
import os
from pathlib import Path


@contextmanager
def data_directory_lock(directory):
    data = Path(directory).resolve()
    data.mkdir(parents=True, exist_ok=True)
    # Never unlink this file: replacing its inode could allow two lock owners.
    with (data / '.instance.lock').open('a+b') as stream:
        if stream.seek(0, os.SEEK_END) == 0:
            stream.write(b'\0')
            stream.flush()
        stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise OSError('This data directory is already in use or cannot be locked. Stop its existing Studio first.') from None
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
