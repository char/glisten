%define COUNT 8
%macro LOOP_BODY 1
%%again:
    vmovdqu64 zmm31, [r8 + r9*8]
    kmovq k7, rax
    dec %1
    jnz %%again
%endmacro
%if COUNT > 1
    times COUNT db 0q17, $$ - $
%endif
/* shared block comment */
