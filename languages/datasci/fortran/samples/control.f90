program control
  implicit none
  integer :: i, n, a(10)
  real :: total
  n = 10; total = 0.0
  do concurrent (i = 1:n)
    a(i) = i
  end do
  do i = 1, n
    if (mod(i, 2) == 0) then
      cycle
    else if (i == 9) then
      exit
    end if
    total = total + & ! continue on the next line
      & real(i)
  end do
  select case (n)
  case (1:10)
    print *, 'It''s in range:', total
  case default
    error stop "out of range"
  end select
end program control
