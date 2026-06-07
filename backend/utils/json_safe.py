"""Convert NumPy scalars/arrays to JSON-serializable Python types."""

from __future__ import annotations

from typing import Any

import numpy as np


def to_json_safe(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): to_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_json_safe(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return to_json_safe(obj.tolist())
    if isinstance(obj, np.generic):
        return to_json_safe(obj.item())
    if isinstance(obj, bool):
        return bool(obj)
    if isinstance(obj, (int, float, str)) or obj is None:
        return obj
    if hasattr(obj, "item"):
        try:
            return to_json_safe(obj.item())
        except Exception:
            pass
    return obj
