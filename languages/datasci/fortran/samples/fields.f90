module fields
  use, intrinsic :: iso_fortran_env, only: real64
  implicit none
  private
  public :: point, distance2

  type :: point
    real(real64) :: x = 0.0_real64, y = 0.0_real64
  end type point
contains
  pure function distance2(p, q) result(d)
    type(point), intent(in) :: p, q
    real(real64) :: d
    d = (p%x - q%x)**2 + (p%y - q%y)**2
  end function distance2
end module fields
