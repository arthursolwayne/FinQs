"""Search for US Steel merger information in SEC filings"""
import asyncio
from tools import edgar_search

async def main():
    # Search for US Steel filings about Nippon Steel merger
    results = await edgar_search(
        query="Nippon Steel merger",
        ciks=["0001163302"],  # US Steel CIK
        form_types=["10-K", "10-Q", "8-K"],
        start_date="2024-01-01",
        top_n_results=10
    )

    print(f"Found {len(results)} filings")
    print("\n" + "="*80 + "\n")

    for i, filing in enumerate(results, 1):
        print(f"{i}. {filing.get('formType', 'N/A')} - {filing.get('filedAt', 'N/A')}")
        print(f"   Company: {filing.get('companyName', 'N/A')}")
        print(f"   URL: {filing.get('linkToFilingDetails', 'N/A')}")
        print(f"   Description: {filing.get('description', 'N/A')[:200]}...")
        print()

if __name__ == "__main__":
    asyncio.run(main())
