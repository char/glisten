; Identifiers, unusual types and literal forms
%"a\22b" = type <{ i128, <4 x i32>, ptr }>
$group = comdat any
@1 = global i256 0
@"strange name" = private constant [3 x i8] c"\FF\00a"
@numbers = global [5 x double] [double 0x3FF0000000000000, double 0xK3FFF8000000000000000, double 0xL00000000000000003FFF000000000000, double 0xH3C00, double 0xR3F80]
define void @test() {
0:
  %1 = getelementptr inbounds [3 x i8], ptr @"strange name", i64 0, i64 1
  %2 = icmp eq ptr %1, null
  ret void
}

declare swifttailcc void @swift() #1
declare spir_func void @device() #2
define amdgpu_kernel void @kernel() #3 {
  ret void
}
attributes #1 = { nocallback nosync ssp memory(read) }
attributes #2 = { sspstrong memory(write) }
attributes #3 = { sspreq memory(readwrite) vscale_range(1, 4) }

declare i32 @personality(...)
declare void @maythrow()
define void @exceptional() personality ptr @personality {
entry:
  invoke void @maythrow() to label %ok unwind label %unwind
ok:
  ret void
unwind:
  %pad = cleanuppad within none []
  cleanupret from %pad unwind to caller
}

define void @landing() personality ptr @personality {
entry:
  invoke void @maythrow() to label %ok unwind label %unwind
ok:
  ret void
unwind:
  %lp = landingpad { ptr, i32 } cleanup
  resume { ptr, i32 } %lp
}

declare token @llvm.experimental.gc.statepoint.p0(i64, i32, ptr, i32, i32, ...)
define void @safepoint() gc "statepoint-example" {
  %tok = call token (i64, i32, ptr, i32, i32, ...) @llvm.experimental.gc.statepoint.p0(i64 0, i32 0, ptr elementtype(void ()) undef, i32 0, i32 0, i32 0, i32 0)
  ret void
}
