const { status: httpStatus } = require("http-status");
const logger = require("../../config/logger");
const { Op } = require("sequelize");
const ApiError = require("../../utils/ApiError");
const { parsePagination } = require("../../utils/pagination");
const { roundMoney } = require("../../utils/money");
const {
  CostCalculation,
  CostCalculationTask,
  BidMaximizer,
  CostCalculationSetting,
  User,
  ClientChecklist,
} = require("../../models");

const createCostCalculator = async (reqBody) => {
  try {
    const {
      property_name,
      client_id,
      estimated_sqft = 0,
      room_count = 0,
      restroom_count = 0,
      stall_count = 0,
      kitchen_count = 0,
      employee_count = 1,
      hourly_wage = 0,
      custom_tasks = [],
      created_by,
      trash_can_count = 0,
      walkaround_minutes = 0,
    } = reqBody;

    const client = await User.findByPk(client_id);

    const checklist = await ClientChecklist.findOne({
      where: {
        user_id: client_id,
      },
    });

    if (!client) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found");
    }

    const settings = await CostCalculationSetting.findAll({
      where: {
        client_type: client.client_type,
      },
    });

    const settingMap = {};
    if (!settings.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No cost calculation settings found for client type ${client.client_type}`,
      );
    }

    settings.forEach((item) => {
      settingMap[item.item_type] = Number(item.minutes_per_unit);
    });

    let totalMinutes = 0;

    // Square footage
    totalMinutes += (Number(estimated_sqft) / 1000) * (settingMap.SQFT || 0);

    // Rooms
    totalMinutes += Number(room_count) * (settingMap.ROOM || 0);

    // Restrooms
    totalMinutes += Number(restroom_count) * (settingMap.RESTROOM || 0);

    // Stalls
    totalMinutes += Number(stall_count) * (settingMap.STALL || 0);

    // Kitchens
    totalMinutes += Number(kitchen_count) * (settingMap.KITCHEN || 0);

    // Trash cans
    totalMinutes += Number(trash_can_count) * (settingMap.TRASH_CAN || 0);

    // Walkaround
    totalMinutes += Number(walkaround_minutes || 0);

    // =========================
    // FLOOR TYPE ADJUSTMENTS
    // =========================

    if (checklist) {
      const sqft = Number(estimated_sqft || checklist.estimated_sqft || 0);

      const carpetSqft =
        (sqft * Number(checklist.carpet_percentage || 0)) / 100;

      const concreteSqft =
        (sqft * Number(checklist.concrete_percentage || 0)) / 100;

      const vctLvtSqft =
        (sqft * Number(checklist.vct_lvt_percentage || 0)) / 100;

      const tileSqft = (sqft * Number(checklist.tile_percentage || 0)) / 100;

      const floorAdjustmentMinutes =
        (carpetSqft / 1000) * (settingMap.CARPET || 0) +
        (concreteSqft / 1000) * (settingMap.CONCRETE || 0) +
        (vctLvtSqft / 1000) * (settingMap.VCT_LVT || 0) +
        (tileSqft / 1000) * (settingMap.TILE || 0);

      totalMinutes += floorAdjustmentMinutes;
    }

    // =========================
    // CUSTOM TASKS
    // =========================

    let equipmentCost = 0;
    let chemicalCost = 0;

    if (Array.isArray(custom_tasks)) {
      for (const task of custom_tasks) {
        totalMinutes += Number(task.estimated_minutes || 0);

        equipmentCost += Number(task.equipment_cost || 0);

        chemicalCost += Number(task.chemical_cost || 0);
      }
    }

    // =========================
    // FINAL CALCULATIONS
    // =========================

    

    const estimatedHours = totalMinutes / 60;

    const hoursPerEmployee =
      employee_count > 0 ? estimatedHours / employee_count : estimatedHours;

    const laborCost = estimatedHours * hourly_wage;

    const totalOperationalCost = laborCost + equipmentCost + chemicalCost;

    // =========================
    // SAVE MAIN CALCULATION
    // =========================

    const calculation = await CostCalculation.create({
      property_name,
      client_id,
      estimated_sqft,
      room_count,
      restroom_count,
      stall_count,
      kitchen_count,
      employee_count,
      hourly_wage,
      trash_can_count,
      walkaround_minutes,

      estimated_minutes: Number(totalMinutes.toFixed(2)),

      estimated_hours: Number(estimatedHours.toFixed(2)),

      hours_per_employee: Number(hoursPerEmployee.toFixed(2)),

      labor_cost: roundMoney(laborCost),

      equipment_cost: roundMoney(equipmentCost),

      chemical_cost: roundMoney(chemicalCost),

      total_operational_cost: roundMoney(totalOperationalCost),

      created_by,
    });

    // =========================
    // SAVE CUSTOM TASKS
    // =========================

    if (Array.isArray(custom_tasks) && custom_tasks.length > 0) {
      const taskPayload = custom_tasks.map((task) => ({
        calculation_id: calculation.id,

        service_name: task.service_name,

        estimated_minutes: Number(task.estimated_minutes) || 0,

        equipment_cost: Number(task.equipment_cost) || 0,

        chemical_cost: Number(task.chemical_cost) || 0,

        notes: task.notes || null,
      }));

      await CostCalculationTask.bulkCreate(taskPayload);
    }

    // =========================
    // RETURN RESPONSE
    // =========================

    return await CostCalculation.findOne({
      where: {
        id: calculation.id,
      },
      include: [
        {
          model: CostCalculationTask,
          as: "custom_tasks",
        },
      ],
    });
  } catch (error) {
    logger.error("createCostCalculator error", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getCostCalculationById = async (id) => {
  try {
    const calculation = await CostCalculation.findOne({
      where: {
        id,
      },
      include: [
        {
          model: CostCalculationTask,
          as: "custom_tasks",
        },
      ],
    });

    if (!calculation) {
      throw new ApiError(httpStatus.NOT_FOUND, "Cost calculation not found");
    }

    return calculation;
  } catch (error) {
    logger.error("getCostCalculationById error", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getAllCostCalculations = async (query) => {
  try {
    const { search = "" } = query;
    const { page, limit, offset } = parsePagination(query);

    const whereCondition = {
      is_active: true,
    };

    if (search) {
      whereCondition.property_name = {
        [Op.like]: `%${search}%`,
      };
    }

    const calculations = await CostCalculation.findAndCountAll({
      where: whereCondition,

      include: [
        {
          model: CostCalculationTask,
          as: "custom_tasks",
        },
      ],

      order: [["id", "DESC"]],

      limit: Number(limit),

      offset: Number(offset),
    });

    return {
      total: calculations.count,
      current_page: Number(page),
      total_pages: Math.ceil(calculations.count / limit),
      data: calculations.rows,
    };
  } catch (error) {
    logger.error("getAllCostCalculations error", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteCostCalculation = async (id) => {
  try {
    const calculation = await CostCalculation.findByPk(id);

    if (!calculation) {
      throw new ApiError(httpStatus.NOT_FOUND, "Cost calculation not found");
    }

    await calculation.destroy();

    return calculation;
  } catch (error) {
    logger.error("deleteCostCalculation error", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const createBidMaximizer = async (reqBody) => {
  try {
    const {
      cost_calculation_id,
      profit_margin_percentage = 30,
      overhead_percentage = 10,
      risk_buffer_amount = 0,
      commission_percentage = 5,
      created_by,
    } = reqBody;

    // =========================
    // FIND COST CALCULATION
    // =========================

    const calculation = await CostCalculation.findByPk(cost_calculation_id);

    if (!calculation) {
      throw new ApiError(httpStatus.NOT_FOUND, "Cost calculation not found");
    }

    // =========================
    // BASE OPERATIONAL COST
    // =========================

    const operationalCost = Number(calculation.total_operational_cost);

    // =========================
    // PROFIT MARGIN
    // =========================

    const profitAmount = operationalCost * (profit_margin_percentage / 100);

    // =========================
    // OVERHEAD COST
    // =========================

    const overheadAmount = operationalCost * (overhead_percentage / 100);

    // =========================
    // RECOMMENDED BID
    // =========================

    const recommendedBid =
      operationalCost + profitAmount + overheadAmount + risk_buffer_amount;

    // =========================
    // MINIMUM SAFE BID
    // =========================

    const minimumBid = operationalCost + overheadAmount;

    // =========================
    // MAXIMUM MARKET BID
    // =========================

    const maximumBid = recommendedBid + recommendedBid * 0.15;

    // =========================
    // COMMISSION
    // =========================

    const commissionAmount = recommendedBid * (commission_percentage / 100);

    // =========================
    // SAVE BID
    // =========================

    const bid = await BidMaximizer.create({
      cost_calculation_id,

      operational_cost: roundMoney(operationalCost),

      profit_margin_percentage,

      overhead_percentage,

      risk_buffer_amount,

      minimum_bid: roundMoney(minimumBid),

      recommended_bid: roundMoney(recommendedBid),

      maximum_bid: roundMoney(maximumBid),

      commission_percentage,

      commission_amount: roundMoney(commissionAmount),

      created_by,
    });

    return bid;
  } catch (error) {
    logger.error("createBidMaximizer error", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getCostCalculationSettings = async (query) => {
  try {
    const { client_type } = query;

    const where = {};

    if (client_type) {
      where.client_type = client_type;
    }

    return await CostCalculationSetting.findAll({
      where,
      order: [
        ["client_type", "ASC"],
        ["id", "ASC"],
      ],
    });
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateCostCalculationSetting = async (reqBody) => {
  try {
    const { id, minutes_per_unit } = reqBody;

    const setting = await CostCalculationSetting.findByPk(id);

    if (!setting) {
      throw new ApiError(httpStatus.NOT_FOUND, "Setting not found");
    }

    setting.minutes_per_unit = minutes_per_unit;

    await setting.save();

    return setting;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

module.exports = {
  createCostCalculator,
  getCostCalculationById,
  getAllCostCalculations,
  deleteCostCalculation,
  createBidMaximizer,
  getCostCalculationSettings,
  updateCostCalculationSetting,
};
