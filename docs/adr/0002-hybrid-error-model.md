# Hybrid error model — throws for transport, results for verification

Network and gateway failures throw typed errors (`MpaisaError` hierarchy carrying `rCode`), matching payment SDK conventions. But `verifyDigest()` and `verifyRedirect()` return discriminated results instead of throwing: verification failure means possible redirect tampering, and a swallowed boolean check fails loudly at compile time rather than silently passing stolen transactions. A deliberate deviation from the all-throw style of stripe-node et al.
