LIBRARY ieee;
USE ieee.std_logic_1164.ALL;

ENTITY testbench IS END ENTITY;
ARCHITECTURE simulation OF testbench IS
  SIGNAL clk : std_logic := '0';
  SIGNAL data : std_logic_vector(7 DOWNTO 0) := x"FF";
BEGIN
  clk <= NOT clk AFTER 5 ns;
  uut : ENTITY work.counter(rtl)
    GENERIC MAP (WIDTH => 8)
    PORT MAP (clk => clk, reset_n => '1', count => OPEN);
  PROCESS
  BEGIN
    WAIT UNTIL clk'EVENT AND clk = '1';
    ASSERT data'LENGTH = 8 REPORT "unexpected ""width""" SEVERITY error;
    WAIT FOR 12 ns;
    WAIT;
  END PROCESS;
END ARCHITECTURE;
