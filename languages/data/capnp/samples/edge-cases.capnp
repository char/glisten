@0x123; # short ID, still a lexical ID
struct Café {
  # Delimiters in strings are not syntax.
  note @0 :Text = "quote: \"; # 雪";
  blob @1 :Data = 0x"00 ff
    ab";
  doc @2 :Text = `literal # text
      `second line
  unfinished @3 :Text = "unterminated
  near @4 :UInt64 = 0xnotHex;
  numberish @5 :UInt32 = 123abc;
  annotationish @6 :Text $x.y("v");
}
