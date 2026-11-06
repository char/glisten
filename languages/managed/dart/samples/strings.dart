// Raw strings do not interpolate or interpret escapes.
final raw = r'hello $name \n';
final rawLong = r'''literal ${notCode}
and \u{1f600}''';
final text = 'Hello $name: ${format({'key': 2})}!\n';
final escaped = "Smile \u{1f600} \u263A \x21, dollar \$";
final long = """line one
${items.map((item) => '$item').join(', ')}
line three""";
final values = [0xff, 42, 1_234, 1.5e-2, 1e9];
