package demo;
import haxe.ds.StringMap;
using StringTools;

@:keep
class Main implements Runnable {
  public static function main():Void {
    var name = "world";
    trace('Hello ${name.toUpperCase()} $name');
    var matches = ~/h[ae]llo\/world/gi;
    for (i in 0...3) trace(i);
  }
  public function run():Void {}
}
