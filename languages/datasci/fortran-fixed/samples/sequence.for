c     Sequence fields are ignored                                       00000001
      SUBROUTINE SCALE(N, X)                                            00000002
      INTEGER N, I                                                      00000003
      REAL X(N)                                                         00000004
      DO 20 I = 1, N                                                    00000005
      X(I) = 2.0 * X(I)                                                 00000006
   20 CONTINUE                                                          00000007
      END                                                               00000008
