package types_pkg;
  typedef enum logic [1:0] { IDLE, RUN, DONE } state_t;
  typedef struct packed { logic valid; bit [3:0] value; } item_t;
endpackage

interface bus_if(input logic clk);
  logic [3:0] data;
  modport master(output data, input clk);
endinterface

module checker_example(input logic clk, ready);
  logic [3:0] mask = 4'b10x?;
  int signed_value = 32'sd5;
  real delay_value = 1.5e3;
  default clocking cb @(posedge clk); endclocking
  property response; ready |-> ##2 ready; endproperty
  assert property (response);
  // Four-state equality and shifts
  always_comb if (mask === 4'b0000) mask = mask <<< 1;
  /* simulation control */
  initial $display("ready: %b", ready);
endmodule
