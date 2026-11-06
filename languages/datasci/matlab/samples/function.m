function [result, average] = analyze(A, scale)
arguments
    A double
    scale (1,1) double = 1
end
if isempty(A)
    result = [];
    average = NaN;
    return
elseif scale ~= 0
    result = scale .* A;
else
    result = A;
end
average = mean(result(:));
for k = 1:numel(result)
    result(k) = result(k) + k;
end
end
