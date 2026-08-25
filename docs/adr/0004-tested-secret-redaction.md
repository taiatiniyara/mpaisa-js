# Tested secret redaction in all errors

Gateway error bodies are attached to `MpaisaError` objects because they carry the diagnostic detail merchants need (mismatched cID, malformed requests). To keep that debuggability without leaking credentials, every error-construction point runs payloads through a single redaction pass, and CI tests assert that no error's message or details ever contain the bearer token or client secret. A security guarantee contributors could silently break if it lived only in code review — so the guarantee is enforced by tests, not convention.
