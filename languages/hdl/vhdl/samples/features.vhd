package features is
  subtype byte_t is bit_vector(7 downto 0);
  constant init : byte_t := 8X"FF";
  constant hex_value : integer := 16#FF#;
  constant \name with spaces\ : integer := 2;
  function ready(x : bit) return boolean;
end package;

package body features is
  function ready(x : bit) return boolean is
  begin
    /* VHDL-2008 block comment */
    return x /= '0';
  end function;
end package body;

architecture rtl of demo is
  signal bus_data : bit_vector(7 downto 0);
begin
  bus_data <= byte_t'(b"10101010");
  -- Qualified expressions and attributes are different uses of apostrophes.
  assert bus_data(bus_data'low) = '0' or bus_data'length = 8;
end architecture;
