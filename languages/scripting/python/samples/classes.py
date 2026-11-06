"""Small objects with annotations and decorators."""
from dataclasses import dataclass
from typing import ClassVar, Self


@decorators.register
@dataclass(frozen=True)
class Point:
    x: float
    y: float
    origin: ClassVar[tuple[float, float]] = (0.0, 0.0)

    @classmethod
    def from_pair(cls, pair: tuple[float, float]) -> Self:
        return cls(*pair)

    @property
    def length(self) -> float:
        return (self.x ** 2 + self.y ** 2) ** 0.5

    def scale(self, factor: float = 1.0) -> "Point":
        return Point(self.x * factor, self.y * factor)

    def __str__(self) -> str:
        return f"({self.x}, {self.y})"


class Canvas:
    def __init__(self) -> None:
        self.points: list[Point] = []

    def add(self, point: Point) -> None:
        self.points.append(point)

    def __iter__(self):
        yield from self.points

canvas = Canvas()
canvas.add(Point.from_pair((3, 4)))
print(next(iter(canvas)).length)
