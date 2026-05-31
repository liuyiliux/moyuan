from app.core.config import get_settings

__all__ = ["crypto_service"]

settings = get_settings()


class CryptoService:
    """AES-256-CBC encryption for API keys."""

    def __init__(self):
        self._key: bytes | None = None

    @property
    def key(self) -> bytes:
        if self._key is None:
            raw = settings.encryption_key
            if not raw:
                # Generate a fallback key (warning: not secure for production)
                import hashlib
                raw = hashlib.sha256(b"moyuan-default-key").hexdigest()
            # Ensure 32-byte key
            key_bytes = raw.encode("utf-8")
            if len(key_bytes) < 32:
                key_bytes = key_bytes.ljust(32, b"\x00")
            elif len(key_bytes) > 32:
                key_bytes = key_bytes[:32]
            self._key = key_bytes
        return self._key

    def encrypt(self, plaintext: str) -> str:
        from base64 import b64encode
        from os import urandom
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        iv = urandom(16)
        cipher = Cipher(algorithms.AES(self.key), modes.CBC(iv))
        encryptor = cipher.encryptor()

        # PKCS7 padding
        data = plaintext.encode("utf-8")
        pad_len = 16 - (len(data) % 16)
        data += bytes([pad_len]) * pad_len

        ciphertext = encryptor.update(data) + encryptor.finalize()
        combined = iv + ciphertext
        return b64encode(combined).decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        from base64 import b64decode
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        raw = b64decode(ciphertext)
        iv, data = raw[:16], raw[16:]

        cipher = Cipher(algorithms.AES(self.key), modes.CBC(iv))
        decryptor = cipher.decryptor()

        plaintext = decryptor.update(data) + decryptor.finalize()
        # Remove PKCS7 padding
        pad_len = plaintext[-1]
        return plaintext[:-pad_len].decode("utf-8")

    def mask(self, plaintext: str | None) -> str | None:
        """Mask API key for display: sk-a***...***xyz"""
        if not plaintext:
            return None
        if len(plaintext) <= 8:
            return "*" * len(plaintext)
        return plaintext[:4] + "***...***" + plaintext[-4:]


crypto_service = CryptoService()
