; A small module
source_filename = "sum.c"
target triple = "x86_64-unknown-linux-gnu"
@message = private constant [4 x i8] c"hi\0A\00", align 1

define dso_local i32 @sum(i32 %a, i32 %b) #0 {
entry:
  %result = add nsw i32 %a, %b
  ret i32 %result
}
attributes #0 = { nounwind }
