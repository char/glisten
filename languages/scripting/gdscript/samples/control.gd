extends Node

enum State { IDLE, RUNNING, DONE }
var state: State = State.IDLE

func run(values: Array[int]) -> void:
	var twice = func(x: int) -> int: return x * 2
	for value in values:
		match value:
			0:
				continue
			var n when n > 10:
				break
			_:
				print(twice.call(value))
	while state != State.DONE:
		await get_tree().process_frame
		state = State.DONE
	if self is Node and not false:
		super.queue_free()
	else:
		pass
