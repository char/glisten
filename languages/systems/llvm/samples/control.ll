declare i32 @work(ptr)

define i32 @choose(ptr %p, i1 %test) {
entry:
  br i1 %test, label %yes, label %no
yes:
  %v = call i32 @work(ptr %p), !dbg !2
  br label %done
no:
  br label %done
done:
  %r = phi i32 [ %v, %yes ], [ 0, %no ]
  ret i32 %r
}
!2 = !DILocation(line: 1, column: 2, scope: !0)
!named = !{!2}
