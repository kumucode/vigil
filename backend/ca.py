"""
ca.py — Private CA management for Vigil v2.3 mutual TLS.

Vigil generates a self-signed CA on first start.  Per-agent certificates
are issued from this CA when a host is added.  The CA private key never
leaves the Vigil data volume.  Agent certs have a 10-year lifetime to
avoid expiry headaches for homelab users.

Key files (in DATA_DIR):
  vigil-ca.key   — CA private key   (600, never transmitted)
  vigil-ca.crt   — CA certificate   (644, sent to agents during provisioning)
"""

import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

CA_KEY_FILE  = "vigil-ca.key"
CA_CERT_FILE = "vigil-ca.crt"
CERT_LIFETIME_DAYS = 3650   # 10 years


def _data_dir() -> Path:
    return Path(os.getenv("DATA_DIR", "/data"))


def _ca_key_path()  -> Path: return _data_dir() / CA_KEY_FILE
def _ca_cert_path() -> Path: return _data_dir() / CA_CERT_FILE


def ensure_ca() -> None:
    """Generate the Vigil Private CA if it doesn't exist yet."""
    if _ca_key_path().exists() and _ca_cert_path().exists():
        log.info("Private CA ready — fingerprint: %s", ca_fingerprint())
        return

    log.info("Generating Vigil Private CA (first start)...")
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
    except ImportError:
        raise RuntimeError(
            "The 'cryptography' package is required for TLS support. "
            "Install it: pip install cryptography==44.0.2"
        )

    try:
        key = rsa.generate_private_key(public_exponent=65537, key_size=4096)

        name = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME,         "Vigil Private CA"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME,   "Vigil Self-Hosted"),
        ])

        now = datetime.now(timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now)
            .not_valid_after(now + timedelta(days=CERT_LIFETIME_DAYS))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(
                digital_signature=True, key_cert_sign=True, crl_sign=True,
                content_commitment=False, key_encipherment=False,
                data_encipherment=False, key_agreement=False,
                encipher_only=False, decipher_only=False,
            ), critical=True)
            .sign(key, hashes.SHA256())
        )

        _ca_key_path().write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            )
        )
        _ca_key_path().chmod(0o600)

        _ca_cert_path().write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        _ca_cert_path().chmod(0o644)

        log.info("CA generated — fingerprint: %s", ca_fingerprint())

    except Exception as e:
        log.error("CA generation failed: %s", e)
        raise


def ca_cert_pem() -> str:
    """Return the CA certificate as a PEM string."""
    return _ca_cert_path().read_text()


def ca_fingerprint() -> str:
    """Return SHA-256 fingerprint of the CA cert in colon-hex format."""
    return _fingerprint_pem(ca_cert_pem())


def vigil_client_cert_paths() -> tuple[Path, Path]:
    """Return (cert_path, key_path) for Vigil's own client certificate."""
    return _data_dir() / "vigil-client.crt", _data_dir() / "vigil-client.key"


def ensure_vigil_client_cert() -> None:
    """
    Generate a client certificate for Vigil itself, signed by the Private CA.
    This is presented to agents during the mutual TLS handshake so agents can
    verify they are talking to an authorised Vigil instance.
    Called once on startup after ensure_ca().
    """
    cert_path, key_path = vigil_client_cert_paths()
    if cert_path.exists() and key_path.exists():
        return

    log.info("Generating Vigil client certificate for mutual TLS...")
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        ca_key_pem   = _ca_key_path().read_bytes()
        ca_cert_bytes = _ca_cert_path().read_bytes()
        ca_key  = serialization.load_pem_private_key(ca_key_pem, password=None)
        ca_cert = x509.load_pem_x509_certificate(ca_cert_bytes)

        client_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        subject = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME,       "vigil-server"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Vigil Self-Hosted"),
        ])

        now = datetime.now(timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(ca_cert.subject)
            .public_key(client_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now)
            .not_valid_after(now + timedelta(days=CERT_LIFETIME_DAYS))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(
                digital_signature=True, key_encipherment=True,
                content_commitment=False, data_encipherment=False,
                key_agreement=False, key_cert_sign=False,
                crl_sign=False, encipher_only=False, decipher_only=False,
            ), critical=True)
            .sign(ca_key, hashes.SHA256())
        )

        key_path.write_bytes(client_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
        key_path.chmod(0o600)

        cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        cert_path.chmod(0o644)

        log.info("Vigil client certificate generated.")

    except Exception as e:
        log.error("Vigil client cert generation failed: %s", e)
        raise


def _fingerprint_pem(pem: str) -> str:
    """Compute SHA-256 fingerprint of a PEM certificate."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    cert = x509.load_pem_x509_certificate(pem.encode())
    digest = cert.fingerprint(hashes.SHA256())
    return ":".join(f"{b:02x}" for b in digest)


def issue_agent_cert(host_name: str, host_ip: str) -> tuple[str, str, str]:
    """
    Issue a certificate for an agent host, signed by the Vigil CA.
    Returns (ca_cert_pem, agent_cert_pem, agent_key_pem).
    The agent_key_pem is never stored — caller must discard it after delivery.
    """
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509 import IPAddress
    import ipaddress

    ca_key_pem  = _ca_key_path().read_bytes()
    ca_cert_pem_bytes = _ca_cert_path().read_bytes()

    ca_key  = serialization.load_pem_private_key(ca_key_pem, password=None)
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem_bytes)

    agent_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME,       f"vigil-agent-{host_name}"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Vigil Self-Hosted"),
    ])

    now = datetime.now(timezone.utc)

    san_entries = [x509.DNSName(f"vigil-agent-{host_name}")]
    try:
        san_entries.append(IPAddress(ipaddress.ip_address(host_ip)))
    except ValueError:
        pass

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_cert.subject)
        .public_key(agent_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=CERT_LIFETIME_DAYS))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .add_extension(x509.KeyUsage(
            digital_signature=True, key_encipherment=True,
            content_commitment=False, data_encipherment=False,
            key_agreement=False, key_cert_sign=False,
            crl_sign=False, encipher_only=False, decipher_only=False,
        ), critical=True)
        .sign(ca_key, hashes.SHA256())
    )

    agent_cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    agent_key_pem  = agent_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode()

    fingerprint = _fingerprint_pem(agent_cert_pem)
    log.info("Issued agent cert for %s — fingerprint: %s", host_name, fingerprint)

    return ca_cert_pem(), agent_cert_pem, agent_key_pem


def agent_cert_fingerprint(agent_cert_pem: str) -> str:
    """Return the fingerprint of an agent certificate."""
    return _fingerprint_pem(agent_cert_pem)


def encrypt_cert_package(ca_pem: str, agent_cert: str, agent_key: str,
                          dec_key_raw: str) -> str:
    """
    Encrypt the certificate package with AES-256-GCM using a key derived
    from dec_key_raw via PBKDF2-HMAC-SHA256.  Returns base64-encoded blob.

    Format: salt(16) + nonce(12) + ciphertext + tag(16)
    The salt is random per encryption — same dec_key produces different ciphertext.
    """
    import base64
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes as _hashes
    import json

    payload = json.dumps({
        "ca_cert":    ca_pem,
        "agent_cert": agent_cert,
        "agent_key":  agent_key,
    }).encode()

    salt  = os.urandom(16)
    kdf   = PBKDF2HMAC(algorithm=_hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key   = kdf.derive(dec_key_raw.encode())
    nonce = os.urandom(12)
    ct    = AESGCM(key).encrypt(nonce, payload, None)

    raw = salt + nonce + ct
    return base64.b64encode(raw).decode()


def is_public_ip(ip: str) -> bool:
    """Return True if the IP is a public (non-RFC-1918) address."""
    import ipaddress
    try:
        addr = ipaddress.ip_address(ip)
        return not (addr.is_private or addr.is_loopback or
                    addr.is_link_local or addr.is_multicast)
    except ValueError:
        return False
