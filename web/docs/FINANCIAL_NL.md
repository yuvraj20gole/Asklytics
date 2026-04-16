# Financial natural language (CSV formula engine)

These prompts work on **wide** financial sheets or **long** `year` / `metric` / `value` layouts.

## Time scope

- **Single period:** “ROE for FY 2021”, “in calendar year 2022”.
- **Range:** “2020–2023”, “between 2019 and 2021”, “from 2020 to 2022” — averages, sums, and charts use only those periods.

## Aggregates

- **Average / mean** (including “across all years”).
- **Median.**
- **Highest / lowest** (max, min, peak, trough).
- **Sum / total** only for **revenue, net income, EBITDA, gross profit** — ratios cannot be summed (you get an explicit explanation).

## Growth

- **CAGR / compound annual growth** on the same flow metrics (uses first and last **positive** values and span from period labels).

## Running totals

- **Running total**, **cumulative**, **rolling sum** — same flow metrics as sums; builds a cumulative series by period.

## Presentation

- Margins and YoY growth use **%** on charts; flow amounts use **currency** hints when column names suggest USD/EUR/INR/GBP.

## Server (`financial_facts`)

Templates mirror **average ROE**, **average net margin**, **total revenue**, **total net income**, and **year-range filters** on ratio time-series SQL where applicable.
