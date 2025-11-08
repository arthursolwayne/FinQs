"""
SEC EDGAR Search Tool for Financial Research
"""
import json
import aiohttp
import backoff


def is_429(exception):
    """Check if exception is a 429 rate limit error"""
    return (
        isinstance(exception, aiohttp.ClientResponseError)
        and exception.status == 429
        or "429" in str(exception)
    )


def retry_on_429(func):
    """Decorator to retry on 429 errors with exponential backoff"""
    @backoff.on_exception(
        backoff.expo,
        aiohttp.ClientResponseError,
        max_tries=8,
        base=2,
        factor=3,
        jitter=backoff.full_jitter,
        giveup=lambda e: not is_429(e),
    )
    async def wrapper(*args, **kwargs):
        return await func(*args, **kwargs)
    return wrapper


class EDGARSearch:
    """
    Search the EDGAR Database through the SEC API.

    This tool allows you to search SEC filings by keywords, form types, CIKs, and date ranges.
    Results include filing metadata (not full text).
    """

    SEC_API_KEY = "18738a46871ad63190466560c899596d3d97347bcda72c2e504fcbb4d838c8e7"
    SEC_API_URL = "https://api.sec-api.io/full-text-search"

    @staticmethod
    @retry_on_429
    async def search(
        query: str,
        form_types: list[str] = None,
        ciks: list[str] = None,
        start_date: str = None,
        end_date: str = None,
        page: int = 1,
        top_n_results: int = 10,
    ) -> list[dict]:
        """
        Search the EDGAR Database through the SEC API.

        Args:
            query (str): The keyword or phrase to search (e.g., 'substantial doubt', 'material weakness')
            form_types (list[str], optional): List of form types to search (e.g., ['8-K', '10-Q']). Default: all types
            ciks (list[str], optional): List of CIKs to filter by. Default: all filers
            start_date (str, optional): Start date in yyyy-mm-dd format (e.g., '2024-01-01'). Default: 30 days ago
            end_date (str, optional): End date in yyyy-mm-dd format. Default: today
            page (int, optional): Page number for pagination. Default: 1
            top_n_results (int, optional): Number of results to return. Default: 10

        Returns:
            list[dict]: List of filing results with metadata

        Example:
            results = await EDGARSearch.search(
                query="revenue guidance",
                form_types=["10-K", "10-Q"],
                ciks=["0000320193"],  # Apple Inc.
                start_date="2024-01-01",
                end_date="2024-12-31",
                top_n_results=5
            )
        """
        # Default empty lists if None
        if form_types is None:
            form_types = []
        if ciks is None:
            ciks = []

        # Parse string representations if needed
        if isinstance(form_types, str) and form_types.startswith("[") and form_types.endswith("]"):
            try:
                form_types = json.loads(form_types.replace("'", '"'))
            except json.JSONDecodeError:
                form_types = [item.strip(" \"'") for item in form_types[1:-1].split(",")]

        if isinstance(ciks, str) and ciks.startswith("[") and ciks.endswith("]"):
            try:
                ciks = json.loads(ciks.replace("'", '"'))
            except json.JSONDecodeError:
                ciks = [item.strip(" \"'") for item in ciks[1:-1].split(",")]

        payload = {
            "query": query,
            "formTypes": form_types,
            "ciks": ciks,
            "startDate": start_date,
            "endDate": end_date,
            "page": page,
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": EDGARSearch.SEC_API_KEY,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                EDGARSearch.SEC_API_URL,
                json=payload,
                headers=headers
            ) as response:
                response.raise_for_status()
                result = await response.json()

        return result.get("filings", [])[:int(top_n_results)]


# Convenience function for easy access
async def edgar_search(
    query: str,
    form_types: list[str] = None,
    ciks: list[str] = None,
    start_date: str = None,
    end_date: str = None,
    page: int = 1,
    top_n_results: int = 10,
) -> list[dict]:
    """
    Search SEC EDGAR filings.

    Args:
        query (str): Search keywords or phrase
        form_types (list[str], optional): Filter by form types (e.g., ['10-K', '10-Q'])
        ciks (list[str], optional): Filter by company CIKs
        start_date (str, optional): Start date (yyyy-mm-dd)
        end_date (str, optional): End date (yyyy-mm-dd)
        page (int, optional): Page number
        top_n_results (int, optional): Max number of results to return

    Returns:
        list[dict]: Filing results
    """
    return await EDGARSearch.search(
        query=query,
        form_types=form_types,
        ciks=ciks,
        start_date=start_date,
        end_date=end_date,
        page=page,
        top_n_results=top_n_results,
    )
