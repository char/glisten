@[Deprecated("Use Shape")]
abstract class Shape
  abstract def area(scale : Float64 = 1.0_f64) : Float64
end

alias MaybeName = String | Nil
record Point, x : Int32, y : Int32

class Circle < Shape
  getter radius : Float64

  def initialize(@radius : Float64)
  end

  def area(scale : Float64 = 1.0_f64) : Float64
    Math::PI * radius ** 2 * scale
  end
end

values : Array(Int32 | Nil) = [1_i32, nil, 0xff_u8.to_i]
name : String? = values.first?.try(&.to_s)
count = values.count { |value| value.is_a?(Int32) }
callback = ->(x : Int32) { x + 1 }
