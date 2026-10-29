---
tags: [research-slides]
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

I need two slide-ready pictures for tomorrow's deck: (1) the pointer loss L_ptr = -log sum_{v in P} p_v where P is the set of voxels holding a target centre, and (2) pseudocode for the voxel pointing inference: compute s_v = Linear_k(z_v)^T q_0 / sqrt(D) for every voxel, s_null = Linear_null(q_0), softmax over [s_null, s_1..s_V], and return "no object" iff s_null is the max, else the argmax voxel. Put them in figures/ as PNGs with their sources.
