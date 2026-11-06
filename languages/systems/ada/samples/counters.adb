package body Counters is
   function Value (Item : Counter) return Natural is (Item.Count);
   procedure Increment (Item : in out Counter) is
   begin
      if Item.Count < Natural'Last then
         Item.Count := Item.Count + 1;
      else
         raise Constraint_Error with "counter ""full""";
      end if;
   end Increment;
end Counters;
