@tool
class_name Player
extends CharacterBody2D

signal health_changed(value: int)
@export_range(0, 100) var health: int = 100
@onready var sprite: Sprite2D = $Visuals/Sprite
@onready var camera: Camera2D = %Camera

static func direction(angle: float) -> Vector2:
	return Vector2(cos(angle), sin(angle))

func _physics_process(delta: float) -> void:
	if health <= 0:
		return
	velocity = direction(rotation) * 100.0
	move_and_slide()
	health_changed.emit(health)
