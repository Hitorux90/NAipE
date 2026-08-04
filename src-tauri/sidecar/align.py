# sidecar/align.py
from typing import Dict, Any

def align_sequences(
    query: str,
    target: str,
    mode: str = "global",
    match_score: int = 2,
    mismatch_penalty: int = -1,
    gap_penalty: int = -2,
) -> Dict[str, Any]:
    s1 = query.strip().upper()
    s2 = target.strip().upper()
    n = len(s1)
    m = len(s2)

    if n == 0 or m == 0:
        return {
            "score": 0,
            "identity_percent": 0.0,
            "aligned_query": s1,
            "aligned_target": s2,
            "match_line": "",
            "length": 0,
            "matches": 0,
            "mismatches": 0,
            "gaps": 0,
        }

    # Initialize DP matrix
    dp = [[0] * (m + 1) for _ in range(n + 1)]

    if mode == "global":
        for i in range(n + 1):
            dp[i][0] = i * gap_penalty
        for j in range(m + 1):
            dp[0][j] = j * gap_penalty

        for i in range(1, n + 1):
            for j in range(1, m + 1):
                score_match = dp[i - 1][j - 1] + (match_score if s1[i - 1] == s2[j - 1] else mismatch_penalty)
                score_delete = dp[i - 1][j] + gap_penalty
                score_insert = dp[i][j - 1] + gap_penalty
                dp[i][j] = max(score_match, score_delete, score_insert)

        # Traceback from (n, m)
        i, j = n, m
        align1, align2 = [], []
        while i > 0 or j > 0:
            if i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + (match_score if s1[i - 1] == s2[j - 1] else mismatch_penalty):
                align1.append(s1[i - 1])
                align2.append(s2[j - 1])
                i -= 1
                j -= 1
            elif i > 0 and dp[i][j] == dp[i - 1][j] + gap_penalty:
                align1.append(s1[i - 1])
                align2.append("-")
                i -= 1
            else:
                align1.append("-")
                align2.append(s2[j - 1])
                j -= 1
        align1 = "".join(align1[::-1])
        align2 = "".join(align2[::-1])

    else:
        # Local alignment (Smith-Waterman)
        max_score = 0
        max_i, max_j = 0, 0
        for i in range(1, n + 1):
            for j in range(1, m + 1):
                score_match = dp[i - 1][j - 1] + (match_score if s1[i - 1] == s2[j - 1] else mismatch_penalty)
                score_delete = dp[i - 1][j] + gap_penalty
                score_insert = dp[i][j - 1] + gap_penalty
                dp[i][j] = max(0, score_match, score_delete, score_insert)
                if dp[i][j] > max_score:
                    max_score = dp[i][j]
                    max_i, max_j = i, j

        # Traceback from max_score position
        i, j = max_i, max_j
        align1, align2 = [], []
        while i > 0 and j > 0 and dp[i][j] > 0:
            if dp[i][j] == dp[i - 1][j - 1] + (match_score if s1[i - 1] == s2[j - 1] else mismatch_penalty):
                align1.append(s1[i - 1])
                align2.append(s2[j - 1])
                i -= 1
                j -= 1
            elif dp[i][j] == dp[i - 1][j] + gap_penalty:
                align1.append(s1[i - 1])
                align2.append("-")
                i -= 1
            else:
                align1.append("-")
                align2.append(s2[j - 1])
                j -= 1
        align1 = "".join(align1[::-1])
        align2 = "".join(align2[::-1])

    # Generate match_line and statistics
    match_line = []
    matches = 0
    mismatches = 0
    gaps = 0

    for a1, a2 in zip(align1, align2):
        if a1 == "-" or a2 == "-":
            match_line.append(" ")
            gaps += 1
        elif a1 == a2:
            match_line.append("|")
            matches += 1
        else:
            match_line.append(".")
            mismatches += 1

    total_len = len(align1)
    identity_percent = round((matches / total_len) * 100.0, 1) if total_len > 0 else 0.0

    return {
        "score": dp[n][m] if mode == "global" else max_score,
        "identity_percent": identity_percent,
        "aligned_query": align1,
        "aligned_target": align2,
        "match_line": "".join(match_line),
        "length": total_len,
        "matches": matches,
        "mismatches": mismatches,
        "gaps": gaps,
        "mode": mode,
    }
