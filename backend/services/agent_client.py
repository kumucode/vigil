"""
services/agent_client.py — HTTP/HTTPS client for Vigil remote agents.

Owns:
  - URL construction          (_agent_url)
  - mTLS context creation     (build_tls_context)
  - Agent HTTP request        (agent_request)
  - Agent health check        (agent_health)

Extracted from routes/hosts.py in v2.5.

All functions are pure network/TLS concerns with no Flask request or
response objects. They receive ORM objects (Host) and plain values;
they return dicts or raise RuntimeError on failure.
"""

import json
import logging
import ssl
import urllib.error
import urllib.request

from models import Host

log = logging.getLogger(__name__)

AGENT_TIMEOUT_READ  = 30   # seconds — /health and /read (fast operations)
AGENT_TIMEOUT_WRITE = 180  # seconds — /write and /revert (docker compose up)


def _agent_url(host: Host, path: str) -> str:
    """Build the full URL for an agent endpoint."""
    scheme = "https" if host.tls_enabled else "http"
    return f"{scheme}://{host.ip}:{host.port}{path}"


def build_tls_context(host: Host) -> ssl.SSLContext | None:
    """
    Build a mutual TLS SSL context for outbound connections to an agent.

    - Verifies the agent's certificate against Vigil's Private CA.
    - Presents Vigil's own client certificate so the agent can verify Vigil.

    Returns None if TLS is not enabled for this host.
    Raises RuntimeError if TLS is enabled but the context cannot be built
    (e.g. CA cert or client cert files are missing).
    """
    if not host.tls_enabled:
        return None
    from ca import _ca_cert_path, vigil_client_cert_paths, ensure_vigil_client_cert
    try:
        cert_path, key_path = vigil_client_cert_paths()
        if not cert_path.exists() or not key_path.exists():
            ensure_vigil_client_cert()
        if not _ca_cert_path().exists():
            raise FileNotFoundError(f"CA cert not found at {_ca_cert_path()}")
        ctx = ssl.create_default_context()
        ctx.load_verify_locations(str(_ca_cert_path()))
        ctx.load_cert_chain(str(cert_path), str(key_path))
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_REQUIRED
        return ctx
    except Exception as e:
        log.error("Could not create TLS context for host %d: %s", host.id, e)
        raise RuntimeError(
            f"TLS is enabled for this host but the client certificate could not be "
            f"loaded: {e}. Check backend logs and try restarting Vigil."
        )


def agent_request(
    host: Host,
    path: str,
    token: str,
    payload: dict | None = None,
) -> dict:
    """
    POST to an agent endpoint and return the parsed JSON response.

    Uses a longer timeout for write/revert operations since docker compose
    up can take minutes when pulling a new image layer.

    Raises RuntimeError with a human-readable message on any failure.
    """
    url     = _agent_url(host, path)
    data    = json.dumps(payload or {}).encode()
    ssl_ctx = build_tls_context(host)
    is_write = path in ("/write", "/revert")
    timeout  = AGENT_TIMEOUT_WRITE if is_write else AGENT_TIMEOUT_READ

    log.info("[AGENT] %s %s://%s:%s%s (timeout=%ds)",
             "POST", "https" if host.tls_enabled else "http",
             host.ip, host.port, path, timeout)

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type":  "application/json",
            "X-Vigil-Token": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx) as resp:
            result = json.loads(resp.read().decode())
            log.info("[AGENT] %s %s → 200 OK", "POST", path)
            return result

    except urllib.error.HTTPError as e:
        body = e.read().decode()
        log.error("[AGENT] %s %s → HTTP %d: %s", "POST", path, e.code, body)
        # Map common HTTP errors to actionable messages
        if e.code == 401:
            raise RuntimeError("Agent rejected the token — regenerate the host token in Settings → Agents.")
        if e.code == 403:
            raise RuntimeError("Agent denied access — check the token matches the one installed on the agent.")
        if e.code == 404:
            raise RuntimeError(f"Agent endpoint not found ({path}) — is this a compatible Vigil agent?")
        raise RuntimeError(f"Agent returned HTTP {e.code}: {body[:200]}")

    except urllib.error.URLError as e:
        reason = str(e.reason)
        log.error("[AGENT] %s %s → URLError: %s", "POST", path, reason)
        # timed out
        if "timed out" in reason.lower() or "timeout" in reason.lower():
            if is_write:
                raise RuntimeError(
                    f"[TIMEOUT] Agent did not respond within {AGENT_TIMEOUT_WRITE}s. "
                    "Docker Compose may still be running on the remote host — "
                    "check the agent logs before retrying."
                )
            raise RuntimeError(
                f"Agent unreachable — connection timed out after {AGENT_TIMEOUT_READ}s. "
                "Verify the agent is running and the host IP/port are correct."
            )
        # connection refused
        if "connection refused" in reason.lower():
            raise RuntimeError(
                f"Agent offline — connection refused at {host.ip}:{host.port}. "
                "Ensure the vigil-agent service is running on the remote host."
            )
        # name resolution
        if "name or service not known" in reason.lower() or "nodename nor servname" in reason.lower():
            raise RuntimeError(
                f"Cannot resolve host '{host.ip}' — check the hostname/IP in Settings → Agents."
            )
        raise RuntimeError(f"Agent unreachable: {reason}")

    except TimeoutError:
        log.error("[TIMEOUT] %s %s exceeded %ds", "POST", path, timeout)
        raise RuntimeError(
            f"[TIMEOUT] Request to agent timed out after {timeout}s. "
            "The agent may be overloaded or unreachable."
        )
    except Exception as e:
        log.error("[AGENT] Unexpected error on %s %s: %s", "POST", path, e)
        raise RuntimeError(str(e))


def agent_health(host: Host, token: str) -> dict:
    """
    GET /health on the agent and return the parsed JSON response.
    Raises RuntimeError on failure.
    """
    url     = _agent_url(host, "/health")
    ssl_ctx = build_tls_context(host)
    req     = urllib.request.Request(
        url,
        headers={"X-Vigil-Token": token},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=AGENT_TIMEOUT_READ,
                                    context=ssl_ctx) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        raise RuntimeError(str(e))
