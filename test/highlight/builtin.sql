SELECT 
    cast(a01 as array<string>)
--              ^ type.builtin
    cast(a02 as array<struct<int64, int64>>)
--              ^ type.builtin
    cast(a03 as array<struct<array<int64>>>)
--              ^ type.builtin
    cast(a04 as bool),
--              ^ type.builtin
    cast(a05 as bytes),
--              ^ type.builtin
    cast(a06 as date),
--              ^ type.builtin
    cast(a07 as datetime),
--              ^ type.builtin
    cast(a08 as time),
--              ^ type.builtin
    cast(a09 as timestamp),
--              ^ type.builtin
    cast(a10 as interval),
--              ^ type.builtin
    cast(a11 as json),
--              ^ type.builtin
    cast(a12 as int64),
--              ^ type.builtin
    cast(a13 as numeric),
--              ^ type.builtin
    cast(a14 as decimal),
--              ^ type.builtin
    cast(a15 as bignumeric),
--              ^ type.builtin
    cast(a16 as float64),
--              ^ type.builtin
    cast(a17 as string),
--              ^type.builtin
    cast(a18 as struct<string>),
--              ^ type.builtin

