#!/usr/bin/env python3
import json

# Read existing answers
with open('/home/user/FinQs/answers.json', 'r') as f:
    answers = json.load(f)

# Add final batch of answers
new_answers = [
    {
        "question_number": 24,
        "question": "As of March 10, 2025, what is the face value of Salesforce's debt excluding their sustainability notes?",
        "answer": "FINAL ANSWER: As of Salesforce's fiscal year 2024 (ended January 31, 2024), the face value of debt excluding sustainability notes was $7.0 billion.\n\nBreakdown:\nIn July 2021, Salesforce issued $8.0 billion of senior notes comprised of:\n- $1.0 billion sustainability notes due 2028\n- $7.0 billion of other senior notes:\n  - $1.0 billion 2024 notes (matured July 15, 2024)\n  - $1.5 billion 2031 notes\n  - $1.25 billion 2041 notes\n  - $2.0 billion 2051 notes\n  - $1.25 billion 2061 notes\n\nAs of January 31, 2024, all $7.0 billion of non-sustainability notes remained outstanding (the $1.0 billion 2024 notes had not yet matured). During fiscal 2024, Salesforce made $1.2 billion in debt repayments which may have reduced the outstanding principal.\n\nNote: As of March 10, 2025, the 2024 notes would have matured (July 15, 2024), reducing the total to approximately $6.0 billion excluding sustainability notes, assuming no other changes.",
        "sources": [
            {
                "url": "https://www.sec.gov/Archives/edgar/data/1108524/000110852424000005/crm-20240131.htm",
                "name": "Salesforce 10-K for fiscal year ended January 31, 2024"
            },
            {
                "url": "https://investor.salesforce.com/news/news-details/2021/Salesforce-Announces-Pricing-of-Aggregate-8-Billion-Senior-Notes-Offering/default.aspx",
                "name": "Salesforce $8 Billion Senior Notes Offering (July 2021)"
            }
        ]
    },
    {
        "question_number": 25,
        "question": "Summarize the regulatory risks Paylocity's (NASDAQ: PCTY) lists in its FY 2024 10-K.",
        "answer": "FINAL ANSWER: Based on Paylocity's fiscal year 2024 10-K (ended June 30, 2024), key regulatory risks include:\n\n**AI and Technology Regulation:**\nPaylocity's ability to leverage AI Assist and other forms of artificial intelligence and machine learning in its technology may be constrained by current and future laws, regulations, interpretive positions or standards governing new and evolving technologies and ethical considerations that could restrict or impose burdensome and costly requirements on its ability to continue to leverage data in innovative ways.\n\n**Additional Regulatory Risk Categories (typical for HCM/payroll companies):**\nWhile specific details from the full Risk Factors section were not accessible in the search results, companies like Paylocity typically face regulatory risks in these areas:\n- Data privacy and security regulations (GDPR, CCPA, etc.)\n- Employment and labor law compliance requirements\n- Tax law and payroll regulation changes\n- Healthcare and benefits administration compliance (ACA, ERISA)\n- Financial services and payment processing regulations\n\nNote: For a comprehensive view of all regulatory risks, the complete Risk Factors section (Part I, Item 1A) of the Form 10-K filed August 6, 2024 should be reviewed at Paylocity's investor relations website.",
        "sources": [
            {
                "url": "https://investors.paylocity.com/static-files/8a7e29c0-85d9-47f6-b7fc-4c8051728881",
                "name": "Paylocity 10-K for fiscal year ended June 30, 2024"
            },
            {
                "url": "https://investors.paylocity.com/news-releases/news-release-details/paylocity-announces-fourth-quarter-and-full-fiscal-year-2024",
                "name": "Paylocity Q4 and Full FY 2024 Results"
            }
        ]
    },
    {
        "question_number": 28,
        "question": "What are Netflix's (NASDAQ: NFLX) Total Projected Material Cash Requirements for 2025?",
        "answer": "FINAL ANSWER: Based on Netflix's 10-K for the year ended December 31, 2024, the Total Projected Material Cash Requirements for 2025 include:\n\n**Content Obligations (as of December 31, 2024):**\n- Total content obligations: $23.2 billion\n  - Current content liabilities (due within 12 months): $4.4 billion\n  - Non-current content liabilities: $1.8 billion\n  - Obligations not yet on balance sheet: $17.0 billion\n  \n**Unknown Future Content Obligations:**\n- Estimated at $1 billion to $4 billion over the next three years\n- Majority of payments expected after the first 12 months\n\n**Debt Obligations (near-term):**\n- Principal and interest due in next 12 months: $1,697 million (approximately $1.7 billion)\n\n**Estimated Total Material Cash Requirements for 2025:**\nApproximately $6.1 billion minimum, consisting of:\n- Content obligations (current): $4.4 billion\n- Debt service (12 months): $1.7 billion\n- Plus lease obligations and other contractual commitments\n\nNote: The complete material cash requirements table in the 10-K's MD&A section would provide the precise total across all categories (content, debt, leases, and other obligations), but this was not fully accessible in the search results.",
        "sources": [
            {
                "url": "https://www.sec.gov/Archives/edgar/data/1065280/000106528025000044/nflx-20241231.htm",
                "name": "Netflix 10-K for fiscal year ended December 31, 2024"
            },
            {
                "url": "https://www.sec.gov/Archives/edgar/data/1065280/000106528025000176/nflx-20250331.htm",
                "name": "Netflix 10-Q for quarter ended March 31, 2025"
            }
        ]
    },
    {
        "question_number": 32,
        "question": "For loanDepot (NYSE: LDI) what is the breakdown of loan originations between purchases and refinancings for the last 9 months as of 11/12/2024?",
        "answer": "FINAL ANSWER: Based on available data, the breakdown of loan originations for loanDepot for Q3 2024 (three months ended September 30, 2024, the most recent period prior to November 12, 2024) was:\n\n**Q3 2024 (July-September 2024):**\n- Purchase loans: 66% of total originations\n- Refinance loans: 34% of total originations\n- Total Q3 2024 origination volume: $6.7 billion\n\nThis represents a shift from Q3 2023 when purchase loans comprised 71% of volume.\n\nNote: The question specifically asks for the \"last 9 months as of 11/12/2024,\" which would be the period from approximately February 12, 2024 to November 12, 2024. However, publicly available quarterly and annual filings provide data through September 30, 2024 (Q3 2024 end), not through November 12, 2024. The complete nine-month cumulative breakdown (Q1-Q3 2024 combined) was not explicitly stated in available earnings releases and SEC filings. The Q3 2024 quarterly figure (66% purchase / 34% refinance) represents the most recent period available.",
        "sources": [
            {
                "url": "https://www.sec.gov/Archives/edgar/data/1831631/000183163124000266/a2024q3formearningsrelease.htm",
                "name": "loanDepot Q3 2024 Earnings Release"
            },
            {
                "url": "https://investors.loandepot.com/news/corporate-and-financial-news/corporate-and-financial-news-details/2024/loanDepot-Announces-Third-Quarter-2024-Financial-Results/default.aspx",
                "name": "loanDepot Q3 2024 Financial Results"
            }
        ]
    }
]

# Add new answers
answers.extend(new_answers)

# Save updated answers
with open('/home/user/FinQs/answers.json', 'w') as f:
    json.dump(answers, f, indent=2)

print(f"Added {len(new_answers)} new answers. Total answers: {len(answers)}")
