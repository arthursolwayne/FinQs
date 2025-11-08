def is_token_limit_error(error_msg: str) -> bool:
    """
    Check if an error message indicates a token limit error.

    Args:
        error_msg: The error message to check

    Returns:
        True if the error is related to token limits, False otherwise
    """
    token_limit_patterns = [
        "token limit",
        "tokens_exceeded_error",
        "context length",
        "maximum context length",
        "token_limit_exceeded",
        "maximum tokens",
        "too many tokens",
        "prompt is too long",
        "maximum prompt length",
        "maximum number of tokens allowed",
        "input length and `max_tokens` exceed context",
        "error code: 400",
        "error code: 413",
        "string too long",
        "413",
        "request exceeds the maximum size",
        "request_too_large",
        "too many total text bytes",
    ]

    return any(pattern in error_msg.lower() for pattern in token_limit_patterns)
