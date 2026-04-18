-- Zero out BA hours in service_hours until a BA is hired (end of Q2).
-- Column and calculation paths are preserved; revert by updating rows when BA joins.
UPDATE service_hours SET ba_hours = 0;
