#define SCALE 2.0d0
program portable
  use, intrinsic :: iso_fortran_env, only: int32
  implicit none
  integer(int32), parameter :: mask = int(z'FF', int32)
  real :: value
  character(len=*), parameter :: message = 'continued &
    &text with ''quotes'''
#ifdef USE_SCALE
  value = SCALE
#else
  value = .5e+1
#endif
  if (.true. .and. mask > 0) print *, message, value
end program portable
