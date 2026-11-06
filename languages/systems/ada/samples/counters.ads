with Ada.Text_IO;
package Counters is
   type Counter is tagged private;
   function Value (Item : Counter) return Natural
     with Pre => Item.Value < Natural'Last, Post => Value'Result >= 0;
   procedure Increment (Item : in out Counter) with Inline;
private
   type Counter is tagged record
      Count : Natural := 0;
   end record;
end Counters;
