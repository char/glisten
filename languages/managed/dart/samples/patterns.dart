/* outer /* nested */ still outer */
/** A shape can expose an area. */
abstract interface class Shape {
  double get area;
}
base mixin Named on Shape {
  String get name;
}
extension Describe on Shape {
  String describe() => switch (this) {
    Circle(radius: var r) when r > 0 => 'circle $r',
    _ => 'other',
  };
}
(int, {String label}) record() => (1, label: 'one');
Iterable<int> count() sync* {
  yield 1;
}
Stream<int> more() async* {
  yield* Stream.value(2);
}
class _Point {}
final _Point point = _Point();
final picked = value?.item ?? fallback;
final next = object?..reset()..add(3);
