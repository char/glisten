`include "config.vh"
`ifdef ENABLE
module top(input wire clk, output wire done);
  wire \escaped+name ;
  reg [7:0] data = 8'hFF;
  child u_child (.clk(clk), .done(done), .data(data));
  initial begin
    #10 $display("data=%h\n", data);
    #10ns $finish;
  end
endmodule
`endif
