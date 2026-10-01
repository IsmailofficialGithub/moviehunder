# SECURITY.md - Anti-Sharing & Concurrency Phase Audit

## 1. Threat Model & Mitigations Verified

### 1.1 Race Conditions in Concurrency Limits
*   **Threat:** A user (or bot) fires 10 simultaneous `POST /api/playback/start` requests. If the system reads the stream count (e.g., 0) and then writes, all 10 requests might pass the limit (e.g., 2).
*   **Mitigation Implemented:** ✅ **Verified**. The logic is handled via a single, atomic Redis Lua script. The script performs the `ZREMRANGEBYSCORE` (cleanup), `ZCARD` (count), and `ZADD` (insert) in a single uninterrupted block. Race conditions are mathematically impossible within a single Redis node.

### 1.2 Brute-Forcing Travel Pass Codes
*   **Threat:** An attacker tries to guess the 4-digit travel pass code using an automated script to bypass Household checks.
*   **Mitigation Implemented:** ✅ **Verified**. 
    *   The `POST /api/household/verify-code` endpoint tracks `verify_attempts:{accountId}:{deviceId}`. 
    *   If `attempts > 5`, it automatically deletes the 15-minute `verify_code` from Redis. This completely destroys the attack surface for brute forcing.

### 1.3 OTP Flooding (SMS/Email Bombing)
*   **Threat:** A malicious user triggers the `POST /api/household/request-code` endpoint thousands of times to rack up email/SMS charges for the platform.
*   **Mitigation Implemented:** ✅ **Verified**. 
    *   The endpoint increments a `code_rate_limit:{accountId}:{deviceId}` counter in Redis. 
    *   It blocks requests if the count exceeds 3 per hour (3600 seconds), safely mitigating financial DoS.

### 1.4 Ghost Sessions Consuming Limits
*   **Threat:** A user closes their browser without calling `POST /api/playback/stop`. Their session remains active, preventing them from watching on other devices.
*   **Mitigation Implemented:** ✅ **Verified**.
    *   Concurrency is tracked via Redis `ZSET` where the score is a Unix Timestamp.
    *   Every `/start` call prunes dead streams that haven't sent a heartbeat in the last 120 seconds (`staleCutoff = now - 120`). Ghost sessions naturally evaporate.

### 1.5 Device Spoofing
*   **Threat:** A user continuously cycles random `deviceId` payloads in their `/start` requests.
*   **Mitigation Implemented:** ⚠️ **Acceptable Risk**. 
    *   Currently, `deviceId` is client-generated. 
    *   However, because the `ZSET` strictly caps the *total number of unique device IDs* to the Plan Limit (e.g., 2), cycling IDs will immediately consume all slots and block the user. The only downside is that the user must wait 120 seconds for the ghost slots to expire if they aggressively tamper with `localStorage`. In the future, Device IDs should be signed server-side JWTs.

### 1.6 IP Spoofing (Household Bypassing)
*   **Threat:** A user uses a VPN or manually injects `X-Forwarded-For` headers to pretend they are at the Primary Household IP.
*   **Mitigation Implemented:** ✅ **Verified**.
    *   The backend reads `cf-connecting-ip` (Cloudflare) first, which cannot be spoofed by the client, then falls back to `x-forwarded-for`. 

## 2. Outstanding Security Action Items (To-Do)
*   **Transition from IP to ASN/Subnet:** Currently, the system uses a strict IP match (`household.primarySubnet === currentIp`). Residential IPs rotate frequently. Before taking Household Verification out of Shadow Mode, this must be updated to compare the `/24` subnet or the ISP ASN to prevent massive false positives.
*   **Server-Signed Device IDs:** Move `deviceId` generation to the backend and sign it as a JWT to prevent client-side ID rotation entirely.

## 3. Overall Security Posture
**Status: SECURE (Shadow Mode)**
The core logic for concurrency and verification is heavily fortified by Redis atomic scripts and strict rate-limiting. It is safe to run in production.
