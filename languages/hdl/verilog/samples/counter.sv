`timescale 1ns/1ps
`define WIDTH 8

(* keep = "true" *)
module counter #(parameter int WIDTH = `WIDTH) (
  input logic clk, reset_n,
  output logic [WIDTH-1:0] count
);
  always_ff @(posedge clk or negedge reset_n) begin
    if (!reset_n) count <= '0;
    else count <= count + 1'b1;
  end
endmodule
