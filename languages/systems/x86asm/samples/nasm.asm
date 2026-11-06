bits 64
global sum
section .text
sum:
    mov rax, qword [rbx+rcx*8+16] ; indexed load
    add rax, 0ffh
    ret
section .data
message db 'hello', 10, 0
value dq 0x1234
