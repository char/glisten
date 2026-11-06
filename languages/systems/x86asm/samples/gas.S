#include "config.h"
.section .text
.globl add_value
add_value:
    movq 16(%rbx,%rcx,8), %rax # indexed load
.Lagain:
    addq $5, %rax
    cmpq $0b101, %rax
    jne .Lagain
    ret
