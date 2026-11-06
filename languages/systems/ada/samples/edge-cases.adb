limited private with Inline;
package Context_Demo is
   type Parent is tagged null record;
   type Hidden is new Parent with private;
private
   type Hidden is new Parent with null record;
end Context_Demo;

generic
   with procedure Action;
   with function Build return Integer;
   with package Boxes is new Container (<>);
package Generic_Demo is
   procedure Run with No_Return;
   function Ready return Boolean with Pre => True, Post => Ready'Result;
end Generic_Demo;

PrOcEdUrE Edge_Cases is
   type Parent is tagged null record;
   type Child is new Parent with record
      Count : Integer;
   end record;
   type Index_Type is range 1 .. 10 with Dynamic_Predicate => Index_Type > 0;
   Hex : Integer := 16#FF#;
   Bits : Integer := 2#1010_1010#;
   Real_Value : Float := 1_000.0E-3;
   Élément : Integer := 4;
   Letter : Character := 'a';
   Quote : Character := ''';
   Message : constant String := Integer'Image (Hex);
   function "+" (Left, Right : Integer) return Integer is (Left);
BEGIN
   -- A tick following a name is not a character literal.
   Hex := Integer'First + Élément;
   for Index in Message'Range loop
      null;
   end loop;
   if (Hex /= 0 and then Bits > 0) or else False then
      null;
   end if;
END Edge_Cases;
