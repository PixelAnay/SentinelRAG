def wilson(k, n, z=1.96):
    """'p% [low, high]' 95% Wilson interval for k successes out of n."""
    if n == 0:
        return "n/a"
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return f"{100 * p:.1f}% [{100 * max(0, c - h):.1f}, {100 * min(1, c + h):.1f}]"
