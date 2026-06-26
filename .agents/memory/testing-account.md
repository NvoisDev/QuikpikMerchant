---
name: Testing account — never use real wholesalers
description: Which account to use for test data; strict rule against touching real wholesaler accounts.
---

## Rule
All test data (products, orders, customers, etc.) must be created in the **Quikpik Test Account** only.

- Email: `hello@quikpik.co`
- Wholesaler ID: `user_1756056297340_surulere`
- Business name: Quikpik Test Account Ltd

Never create test data in any real wholesaler account (e.g. Haq Global, Plotafoods, or any other live business).

**Why:** Test products created in real accounts are visible to those wholesalers and their customers, polluting their product lists and causing confusion. In June 2026, `zz_test_product` rows were accidentally created in Haq Global and Plotafoods and had to be manually deleted.

**How to apply:** When the testing skill runs Playwright tests that create products/orders, ensure the test logs in as `hello@quikpik.co` (the Quikpik Test Account). If the test framework picks a different account automatically, add an explicit login step targeting that email before any data-creation steps.
