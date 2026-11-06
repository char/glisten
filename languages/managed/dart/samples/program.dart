import 'dart:async' show Future;

/// A small counter with a named parameter.
sealed class Counter {
  late int value;
  Counter({required this.value});
  int get current => value;
  set current(int next) => value = next;

  @override
  String toString() => 'Counter($value)';
}

Future<int> increment(Counter counter) async {
  final result = await Future.value(counter.current + 1);
  counter
    ..current = result
    ..toString();
  return result;
}
