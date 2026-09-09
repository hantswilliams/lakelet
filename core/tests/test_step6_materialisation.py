# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""Spike for session 9 (brief §7, step 6): can dbt build a table model through the Iceberg
catalog? dbt-duckdb's ``table`` materialisation creates ``<model>__dbt_tmp`` and renames it
over the target inside one transaction, which DuckDB-Iceberg refuses. Measured against the
catalog on September 9: ``CREATE OR REPLACE`` and drop-then-create in one transaction are
refused too; ``DELETE`` then ``INSERT`` in one transaction works and keeps the table's
identity (two snapshots); the swap works when every statement is its own transaction.

The materialisation below is the candidate: rebuild in place when the columns are unchanged,
drop and create in separate transactions when they are not. Whether it ships as
``lakelet_table`` or overrides ``table`` for the project is a decision for the brief."""

from pathlib import Path

from lakelet import Project
from tests.test_step2_dbt_spike import dbt_main, profiles_yml

MATERIALISATION = """
{#- Lakelet's table materialisation for the Iceberg catalog. DuckDB-Iceberg refuses
    CREATE OR REPLACE, and a rename or a drop-then-create inside one transaction, so a
    rebuild keeps the table and replaces its rows (one transaction, two snapshots), and
    falls back to drop-then-create in separate transactions when the columns changed. -#}

{% macro lakelet__columns_of_query(sql) -%}
  {%- set rows = run_query("DESCRIBE (" ~ sql ~ ")") -%}
  {%- set cols = [] -%}
  {%- for row in rows.rows -%}{%- do cols.append((row[0] | lower, row[1] | upper)) -%}{%- endfor -%}
  {{ return(cols) }}
{%- endmacro %}

{% macro lakelet__columns_of_relation(relation) -%}
  {%- set cols = [] -%}
  {%- for c in adapter.get_columns_in_relation(relation) -%}
    {%- do cols.append((c.name | lower, c.dtype | upper)) -%}
  {%- endfor -%}
  {{ return(cols) }}
{%- endmacro %}

{% materialization lakelet_table, adapter="duckdb" %}
  {%- set target_relation = this.incorporate(type='table') -%}
  {%- set existing_relation = load_cached_relation(this) -%}
  {{ run_hooks(pre_hooks, inside_transaction=False) }}

  {%- set in_place = existing_relation is not none
        and existing_relation.is_table
        and lakelet__columns_of_relation(existing_relation)
            == lakelet__columns_of_query(compiled_code) -%}

  {% if in_place %}
    {{ run_hooks(pre_hooks, inside_transaction=True) }}
    {% call statement('delete') -%}
      delete from {{ target_relation }}
    {%- endcall %}
    {% call statement('main') -%}
      insert into {{ target_relation }} {{ compiled_code }}
    {%- endcall %}
    {{ run_hooks(post_hooks, inside_transaction=True) }}
    {{ adapter.commit() }}
  {% else %}
    {#- the column check above opened dbt's transaction; the drop must commit on its own
        before the create, or the catalog refuses to create a table deleted in the same one -#}
    {% if existing_relation is not none %}
      {% call statement('drop') -%}
        drop table {{ existing_relation }}
      {%- endcall %}
      {{ adapter.commit() }}
    {% endif %}
    {% call statement('main') -%}
      create table {{ target_relation }} as {{ compiled_code }}
    {%- endcall %}
    {{ run_hooks(post_hooks, inside_transaction=True) }}
    {{ adapter.commit() }}
  {% endif %}

  {{ run_hooks(post_hooks, inside_transaction=False) }}
  {{ return({'relations': [target_relation]}) }}
{% endmaterialization %}
"""

CONFIG = "{{ config(materialized='lakelet_table') }}\n"
MODEL_V1 = CONFIG + "select c, count(*) as n from src group by 1"
MODEL_V2 = CONFIG + "select c, count(*) * 2 as n from src group by 1"
MODEL_V3 = CONFIG + "select c, count(*) as n, sum(id) as total from src group by 1"


def _run(root: Path) -> None:
    result = dbt_main.dbtRunner().invoke(
        ["run", "--project-dir", str(root), "--profiles-dir", str(root), "--no-use-colors"]
    )
    assert result.success, result.exception
    statuses = {r.node.name: str(r.status) for r in result.result.results}
    assert statuses == {"q": "success"}, statuses


def test_dbt_builds_and_rebuilds_a_table_through_the_catalog(tmp_path) -> None:
    root = tmp_path / "proj"
    Project.init(root)
    (root / "macros").mkdir()
    (root / "macros" / "lakelet.sql").write_text(MATERIALISATION)
    model = root / "models" / "q.sql"
    model.write_text(MODEL_V1)
    with Project.open(root) as p:
        (root / "profiles.yml").write_text(profiles_yml(p.catalog_url))
        p.engine.execute(
            "CREATE TABLE lakelet.main.src AS "
            "SELECT range AS id, 'c' || (range % 3) AS c FROM range(90)"
        )

        _run(root)  # first build: create table as
        assert p.engine.execute("select sum(n) from q").fetchone()[0] == 90
        first = p.tables.describe("q")
        assert first.snapshots == 1

        model.write_text(MODEL_V2)
        _run(root)  # same columns: rows replaced, the table keeps its identity and history
        assert p.engine.execute("select sum(n) from q").fetchone()[0] == 180
        second = p.tables.describe("q")
        assert second.location == first.location
        assert second.snapshots == 3  # a delete snapshot and an append snapshot

        model.write_text(MODEL_V3)
        _run(root)  # a new column: drop and create, separate transactions
        assert p.engine.execute("select sum(total) from q").fetchone()[0] == sum(range(90))
        third = p.tables.describe("q")
        assert [c[0] for c in third.columns] == ["c", "n", "total"]
        assert third.snapshots == 1

        assert [t.name for t in p.tables.list()] == ["q", "src"]
