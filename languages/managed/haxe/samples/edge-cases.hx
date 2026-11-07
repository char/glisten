class Edges {
  static function test(x:Int) {
    var a = '${{ value: { n: x } }.value.n} $x';
    var b = "not ${x} or $x";
    var c = 'escaped \$x and $$x and \' quote';
    var ratio = x / 2; var re = ~/[a\/]+/gi;
    var values = [0xFF, 1e3, 1_000, 23i32, 4u32, 5i64, 1.0f64, 0...3];
    @author("someone") trace(macro $v{x});
    // #if not a directive
    /* ${notInterpolation} */
  }
}
