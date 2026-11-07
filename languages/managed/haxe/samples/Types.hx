package example;

/** A plain documentation comment. */
@:native("demo.Result")
enum Result<T> { Ok(value:T); Error(message:String); }
typedef Callback = (Int) -> String;
abstract Id(Int) from Int to Int {
  public inline function new(value:Int) this = value;
}
#if js
extern class Platform { static function run():Void; }
#elseif sys
class Platform { static function run() trace("sys"); }
#else
class Platform {}
#end
