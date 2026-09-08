# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""The ``lakelet`` command.

Step 0 of the brief ships only ``--version`` to prove the entry point. The verbs arrive
with steps 3 to 9.
"""

import typer

from lakelet import __version__

app = typer.Typer(no_args_is_help=True, add_completion=False)


def _print_version(value: bool) -> None:
    if value:
        typer.echo(f"lakelet {__version__}")
        raise typer.Exit()


@app.command()
def main(
    version: bool = typer.Option(
        False,
        "--version",
        callback=_print_version,
        is_eager=True,
        help="Print the version and exit.",
    ),
) -> None:
    """Your laptop is the warehouse until it can't be."""


def run() -> None:
    app()
