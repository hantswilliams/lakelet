# Lakelet — decisions for review, September 21, 2026

*From Hants, looking at the Questions screen in Simple mode after the September 20 batch: a question card offers Refresh and History, and no way to see the answer. One item. It belongs to no brief (the versions round's G7 put questions on the Models screen; the app brief's screen 8 gave them Simple words; neither said how the rows are reached). Tick Agree or write the change. Nothing is built until it is decided.*

---

## What exists today

A saved question is a dbt model, so its answer is a view or a table in the catalog: `by_customer` is in the explorer as "196 rows · local", `big_orders` as "view". The rows are reached the Technical way — click the table in the explorer and **Sample rows** (five rows, `lakelet tables sample`), or type `select * from by_customer` in the SQL box and Run (every row, with the verdict, the chart and the grid). The card says "Up to date. Ready in about under a second." and offers **Refresh** (which rebuilds it) and **History** (its versions). In Simple mode nobody will find the rows. The wording bug on the card ("about under a second") is fixed with this file; a sub-second estimate says "Ready right away."

---

**Q1. Every question card gets "See the answer", which opens the Tables screen with `select * from <question>` run — the verdict, the chart and the rows — so a question is asked and answered in one click.**

*Why it comes up:* the screenshot. The Simple vocabulary calls these questions, and a question you cannot see the answer to is not one. The pieces exist: the workspace runs SQL and shows the rows with the gauge's sentence and the auto-chart; the question is a name in the catalog.

*Recommend:* one button on the card — **See the answer** (Technical: **Rows**) beside Refresh — which switches to the Tables screen, puts `select * from <name>` in the SQL box and runs it, so the results pane shows the answer with the verdict line above it and the chart when the answer is two columns; the line beside it is `lakelet sql 'select * from <name>'`, as every action's is. The box is editable, so the next question is one edit away, which is how a person learns SQL from a question they already understand. A question that has never been refreshed has no rows yet: the button says **Refresh, then see the answer** and does both. The Technical model detail gets the same **Rows** button, since a `view` model's rows are otherwise a detail away.

*Not chosen:* rows inside the card (five rows, no chart, and the card becomes a screen); a separate "Answers" screen (the workspace is the answer screen; a sixth screen would say the app has two places for rows); a dialog (it would hide the editor, which is the way on to the next question).

*Gates:* Vitest for the card's button and the never-refreshed case; `save-question.spec` extended — save, then **See the answer**, and the grid has the question's rows with the verdict; `/docs/app`'s Simple paragraph.

- [x] Agree
- [ ] Change:
