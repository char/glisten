"""Control flow and structural matching."""
from collections.abc import Iterable

type Row = tuple[str, int]
type Rows = list[Row]


def describe(item: object) -> str:
    match item:
        case None:
            return "nothing"
        case True | False:
            return "boolean"
        case [first, *rest] if first is not None:
            return f"sequence: {first!r}, {len(rest)} more"
        case {"name": name, **other}:
            return f"record: {name}, {other}"
        case _:
            return "unknown"


def total(rows: Iterable[Row]) -> int:
    result = 0
    for name, count in rows:
        if count < 0:
            continue
        elif name == "stop":
            break
        else:
            result += count
    else:
        print("all rows processed")
    return result


async def fetch(reader):
    try:
        async with reader:
            return await reader.read()
    except OSError as error:
        raise RuntimeError("read failed") from error
    finally:
        print("finished")
